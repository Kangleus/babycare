import { useState } from 'react';
import { Page } from '@/components/page';
import { EditBtn, Greet, Header, HomeCards, Pred, SecTitle, Timeline } from '@/components/home';
import { CardEditor } from '@/components/card-editor';
import { SamplePill } from '@/components/sample';
import { InviteNudge, useFresh } from '@/components/ob-home';
import { useApp } from '@/state/app-state';

export default function Today() {
  const [edit, setEdit] = useState(false);
  const { demo } = useApp();
  const { guide, nudge } = useFresh();
  return (
    <>
      <Page>
        <Header />
        <Greet />
        <Pred />
        <SecTitle title="今天" right={<EditBtn onPress={() => setEdit(true)} />} />
        <HomeCards />
        {nudge ? <InviteNudge /> : null}
        {guide || demo ? null : <SamplePill />}
        <Timeline />
      </Page>
      <CardEditor open={edit} onClose={() => setEdit(false)} />
    </>
  );
}
