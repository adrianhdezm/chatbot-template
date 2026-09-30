import { PlusIcon } from 'lucide-react';

import { Button } from '~/components/ui/button';

export function NewChatButton() {
  return (
    // A full navigation resets the chat state.
    <Button
      variant="secondary"
      render={
        // The link text comes from the Button children via base-ui's render prop.
        // eslint-disable-next-line jsx-a11y/anchor-has-content
        <a href="/" />
      }
      nativeButton={false}
    >
      <PlusIcon data-icon="inline-start" />
      New Chat
    </Button>
  );
}
