'use client';

import { FormEvent, useState } from 'react';

interface Props {
    onSend: (message: string) => void;
    disabled: boolean;
}

export default function MessageInput({ onSend, disabled }: Props) {
    const [input, setInput] = useState('');

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (input.trim() && !disabled) {
            onSend(input.trim());
            setInput('');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 border-t border-white/10 bg-racing-dark/80 backdrop-blur-sm">
            <div className="flex gap-3">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={disabled}
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:border-neon focus:outline-none focus:ring-1 focus:ring-neon transition-colors"
                />
                <button
                    type="submit"
                    disabled={disabled || !input.trim()}
                    className="px-6 py-3 bg-neon text-racing-dark font-bold rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {disabled ? (
                        <span className="inline-block w-5 h-5 border-2 border-racing-dark/30 border-t-racing-dark rounded-full animate-spin" />
                    ) : (
                        'Send'
                    )}
                </button>
            </div>
        </form>
    );
}
