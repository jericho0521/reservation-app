import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import WhatsAppContactCard from './WhatsAppContactCard';

test('WhatsAppContactCard renders a safe click-to-chat link', () => {
    const html = renderToStaticMarkup(
        <WhatsAppContactCard
            data={{
                name: 'Project Play by CW team',
                phone: '+60 11-1628 1524',
                whatsappUrl: 'https://wa.me/601116281524?text=Hello',
            }}
        />,
    );

    assert.match(html, /Talk to the crew/);
    assert.match(html, /Open WhatsApp/);
    assert.match(html, /href="https:\/\/wa\.me\/601116281524\?text=Hello"/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
});
