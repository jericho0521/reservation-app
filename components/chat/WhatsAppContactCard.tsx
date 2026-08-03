'use client';

import { ExternalLink, MessageCircle, Phone } from 'lucide-react';
import type { WhatsAppContactData } from '@/lib/business-contact';

interface WhatsAppContactCardProps {
    data: WhatsAppContactData;
}

export default function WhatsAppContactCard({ data }: WhatsAppContactCardProps) {
    return (
        <div className="mb-4 max-w-[92%] overflow-hidden rounded-2xl border border-[#25D366]/40 bg-white/10 text-white shadow-lg">
            <div className="flex items-start gap-3 p-4">
                <div className="rounded-full bg-[#25D366]/15 p-2 text-[#25D366]">
                    <MessageCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25D366]">Human support</p>
                    <h3 className="mt-1 font-heading text-lg font-bold uppercase italic tracking-tight">Talk to the crew</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-300">
                        Continue with {data.name} in a pre-filled WhatsApp chat.
                    </p>
                </div>
            </div>

            <div className="border-t border-white/10 bg-racing-dark/40 px-4 py-3">
                <div className="mb-3 flex items-center gap-2 text-sm text-gray-300">
                    <Phone className="h-4 w-4 text-[#25D366]" />
                    <span>{data.phone}</span>
                </div>
                <a
                    href={data.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open WhatsApp chat with ${data.name}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-sm font-bold uppercase tracking-wide text-[#071a10] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 focus-visible:ring-offset-racing-dark"
                >
                    <MessageCircle className="h-4 w-4" />
                    Open WhatsApp
                    <ExternalLink className="h-4 w-4" />
                </a>
            </div>
        </div>
    );
}
