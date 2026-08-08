import assert from 'node:assert/strict';
import test from 'node:test';
import { toPlainChatText } from './chat-plain-text';

test('toPlainChatText removes Markdown formatting without losing its content', () => {
    const markdown = `I need these details:

* **Service:** Racing Simulator or Playstation 5
* **Date:** Your preferred date
* Start and _end time_

[Contact us](https://example.com) if you need help.`;

    assert.equal(
        toPlainChatText(markdown),
        `I need these details:

Service: Racing Simulator or Playstation 5
Date: Your preferred date
Start and end time

Contact us (https://example.com) if you need help.`,
    );
});

test('toPlainChatText never returns asterisks from model output', () => {
    assert.doesNotMatch(toPlainChatText('Use **bold** or *emphasis*.'), /\*/);
});
