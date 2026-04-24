'use client';

import { useState, KeyboardEvent } from 'react';
import { Send, Sparkles } from 'lucide-react';

interface AnalyticsChatInputProps {
    onSubmit: (prompt: string) => void;
    isLoading?: boolean;
}

const EXAMPLE_PROMPTS = [
    'Show me January revenue',
    'Show me January revenue by day and service',
    'Compare Racing Simulator vs PS5',
    'Busiest days this week',
    'Revenue last month',
    'Which service made the most revenue this month?',
];

export function AnalyticsChatInput({ onSubmit, isLoading }: AnalyticsChatInputProps) {
    const [input, setInput] = useState('');

    const handleSubmit = () => {
        if (input.trim() && !isLoading) {
            onSubmit(input.trim());
            setInput('');
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="space-y-4">
            {/* Chat Input */}
            <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <Sparkles className="w-5 h-5 text-neon" />
                </div>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about your analytics... (e.g., 'Show me January revenue')"
                    disabled={isLoading}
                    className="w-full pl-12 pr-14 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-neon/50 focus:ring-1 focus:ring-neon/50 transition-all disabled:opacity-50"
                />
                <button
                    onClick={handleSubmit}
                    disabled={!input.trim() || isLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-neon text-racing-dark rounded-lg hover:bg-neon/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Send className="w-5 h-5" />
                </button>
            </div>

            {/* Example Prompts */}
            <div className="flex flex-wrap gap-2">
                <span className="text-xs text-gray-500">Try:</span>
                {EXAMPLE_PROMPTS.map((prompt, index) => (
                    <button
                        key={index}
                        onClick={() => onSubmit(prompt)}
                        disabled={isLoading}
                        className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-gray-400 hover:text-white hover:border-neon/30 transition-all disabled:opacity-50"
                    >
                        {prompt}
                    </button>
                ))}
            </div>
        </div>
    );
}
