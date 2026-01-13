'use client';

import { useEffect, useRef, useState } from 'react';
import MessageBubble from './MessageBubble';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

export default function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputValue.trim(),
        };

        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInputValue('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: newMessages.map(m => ({
                        role: m.role,
                        content: m.content,
                    })),
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to get response');
            }

            // Read the stream
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let assistantContent = '';

            if (reader) {
                const assistantMessage: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: '',
                };
                setMessages([...newMessages, assistantMessage]);

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    assistantContent += chunk;

                    setMessages(prev => {
                        const updated = [...prev];
                        const lastMsg = updated[updated.length - 1];
                        if (lastMsg?.role === 'assistant') {
                            lastMsg.content = assistantContent;
                        }
                        return updated;
                    });
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: 'Sorry, I encountered an error. Please try again.',
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)]">
            {/* Chat Header */}
            <div className="p-4 border-b border-white/10 bg-white/5">
                <h2 className="text-xl font-bold font-heading">AI Booking Assistant</h2>
                <p className="text-sm text-gray-400">I can help you book a session!</p>
            </div>

            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto p-4">
                {messages.length === 0 && (
                    <div className="text-center text-gray-400 mt-8">
                        <div className="text-4xl mb-4">👋</div>
                        <p className="text-lg mb-2">Hi! I&apos;m your booking assistant.</p>
                        <p className="text-sm">Tell me what you&apos;d like to book and I&apos;ll help you out!</p>
                        <p className="text-sm mt-2">Type a message below or ask me about Racing Simulators or PS5!</p>
                    </div>
                )}

                {messages.map((message) => (
                    <MessageBubble
                        key={message.id}
                        role={message.role}
                        content={message.content}
                    />
                ))}

                {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                    <div className="flex justify-start mb-4">
                        <div className="bg-white/10 rounded-2xl rounded-bl-sm px-4 py-3 border border-white/10">
                            <div className="flex gap-1">
                                <span className="w-2 h-2 bg-neon rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-2 h-2 bg-neon rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-2 h-2 bg-neon rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form
                onSubmit={onSubmit}
                className="p-4 border-t border-white/10 bg-racing-dark/80 backdrop-blur-sm"
            >
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        disabled={isLoading}
                        placeholder="Type your message..."
                        className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:border-neon focus:outline-none focus:ring-1 focus:ring-neon transition-colors"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !inputValue.trim()}
                        className="px-6 py-3 bg-neon text-racing-dark font-bold rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <span className="inline-block w-5 h-5 border-2 border-racing-dark/30 border-t-racing-dark rounded-full animate-spin" />
                        ) : (
                            'Send'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
