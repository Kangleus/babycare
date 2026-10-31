import { useState } from 'react';
import { Page } from '@/components/page';
import { EditBtn, Greet, Header, HomeCards, Pred, SecTitle, Timeline } from '@/components/home';
import { CardEditor } from '@/components/card-editor';

export default function Today() {
  const [edit, setEdit] = useState(false);
  return (
    <>
      <Page>
        <Header />
        <Greet />
        <Pred />
        <SecTitle title="今天" right={<EditBtn onPress={() => setEdit(true)} />} />
        <HomeCards />
        <Timeline />
      </Page>
      <CardEditor open={edit} onClose={() => setEdit(false)} />
    </>
  );
}
