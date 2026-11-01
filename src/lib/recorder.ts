/* 原生录音：expo-audio。iOS 录 16k 单声道 16bit WAV（LINEARPCM），Android 录 16k AAC-ADTS；
   两种格式百炼 Fun-ASR 都直接支持。录音文件读成 base64 交给 Edge Function，之后即删除。 */
import { useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { AudioQuality, IOSOutputFormat, RecordingOptions, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';
import { bytesToB64, MAX_REC_MS, MicError, Recorder } from './recorder-types';

export * from './recorder-types';

const OPTS: RecordingOptions = {
  extension: '.wav', sampleRate: 16000, numberOfChannels: 1, bitRate: 256000, isMeteringEnabled: true,
  android: { extension: '.aac', outputFormat: 'aac_adts', audioEncoder: 'aac', sampleRate: 16000, audioSource: 'voice_recognition' },
  ios: { extension: '.wav', outputFormat: IOSOutputFormat.LINEARPCM, audioQuality: AudioQuality.HIGH, sampleRate: 16000, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
  web: {},
};

export function useRecorder(): Recorder {
  const rec = useAudioRecorder(OPTS);
  const st = useRef<{ t0: number; timer: ReturnType<typeof setInterval> | null; starting: Promise<void> | null }>({ t0: 0, timer: null, starting: null });
  return useMemo<Recorder>(() => {
    const halt = async () => {
      if (st.current.timer) clearInterval(st.current.timer); st.current.timer = null;
      try { await rec.stop(); } catch { /* 已停止 */ }
      try { await setAudioModeAsync({ allowsRecording: false }); } catch { /* ignore */ }
    };
    const drop = (uri: string | null) => { try { if (uri) new File(uri).delete(); } catch { /* ignore */ } };
    const open = async (onLevel: (v: number) => void) => {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) throw new MicError('denied');
        try {
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
          await rec.prepareToRecordAsync(); rec.record();
        } catch (e) { throw new MicError('failed', (e as Error).message); }
        st.current.t0 = Date.now();
        st.current.timer = setInterval(() => {
          const s = rec.getStatus(); const db = s.metering ?? -60;
          onLevel(Math.max(0, Math.min(1, (db + 55) / 50)));
          if (Date.now() - st.current.t0 > MAX_REC_MS) halt();
        }, 110);
    };
    return {
      /* 松手可能早于麦克风打开（等授权）：stop / cancel 先等 start 完成 */
      start(onLevel) { const p = open(onLevel); st.current.starting = p.catch(() => {}); return p; },
      async stop() {
        if (st.current.starting) await st.current.starting;
        const ms = Date.now() - st.current.t0;
        await halt();
        const uri = rec.uri; if (!uri) throw new MicError('failed', 'no file');
        const bytes = new Uint8Array(await new File(uri).arrayBuffer());
        drop(uri);
        return { b64: bytesToB64(bytes), format: Platform.OS === 'ios' ? 'wav' : 'aac', rate: 16000, ms };
      },
      async cancel() { if (st.current.starting) await st.current.starting; await halt(); drop(rec.uri); },
    };
  }, [rec]);
}
