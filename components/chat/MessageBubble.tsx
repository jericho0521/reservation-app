'use client';

interface Props {
    role: 'user' | 'assistant';
    content: string;
}

export default function MessageBubble({ role, content }: Props) {
    const isUser = role === 'user';

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
            <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser
                        ? 'bg-neon text-racing-dark rounded-br-sm'
                        : 'bg-white/10 text-white rounded-bl-sm border border-white/10'
                    }`}
            >
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
            </div>
        </div>
    );
}
