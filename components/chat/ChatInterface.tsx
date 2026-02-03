'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import MessageBubble from './MessageBubble';
import BookingCard from './BookingCard';

interface BookingData {
    service: string;
    date: string;
    time: string;
    seats: number;
    name: string;
    email: string;
}

interface MessageAction {
    type: 'booking_confirmation' | 'booking_success';
    data: BookingData;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    action?: MessageAction;
    actionStatus?: 'pending' | 'confirmed' | 'cancelled' | 'loading';
}

export default function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Auto-focus input when loading finishes or on mount
    useEffect(() => {
        if (!isLoading) {
            inputRef.current?.focus();
        }
    }, [isLoading, messages]);

    const handleConfirmBooking = async (messageId: string, data: BookingData) => {
        // Update message status to loading
        setMessages(prev => prev.map(m =>
            m.id === messageId ? { ...m, actionStatus: 'loading' as const } : m
        ));

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [],
                    confirmBooking: data
                }),
            });

            const result = await response.json();

            // Update to confirmed and add success message
            setMessages(prev => {
                const updated = prev.map(m =>
                    m.id === messageId ? { ...m, actionStatus: 'confirmed' as const } : m
                );
                return [
                    ...updated,
                    {
                        id: Date.now().toString(),
                        role: 'assistant' as const,
                        content: result.content
                    }
                ];
            });
        } catch (error) {
            console.error('Booking confirmation error:', error);
            setMessages(prev => prev.map(m =>
                m.id === messageId ? { ...m, actionStatus: 'pending' as const } : m
            ));
        }
    };

    const handleCancelBooking = (messageId: string) => {
        setMessages(prev => {
            const updated = prev.map(m =>
                m.id === messageId ? { ...m, actionStatus: 'cancelled' as const } : m
            );
            return [
                ...updated,
                {
                    id: Date.now().toString(),
                    role: 'assistant' as const,
                    content: "No problem! Let me know if you'd like to make changes or start a new booking."
                }
            ];
        });
    };

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

            const result = await response.json();

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: result.content,
                action: result.action,
                actionStatus: result.action ? 'pending' : undefined
            };

            setMessages([...newMessages, assistantMessage]);
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
                        <div className="mb-4 flex justify-center">
                            <MessageCircle className="w-12 h-12 text-neon" />
                        </div>
                        <p className="text-lg mb-2">Hi! I&apos;m your booking assistant.</p>
                        <p className="text-sm">Tell me what you&apos;d like to book and I&apos;ll help you out!</p>
                        <p className="text-sm mt-2">Type a message below or ask me about Racing Simulators or PS5!</p>
                    </div>
                )}

                {messages.map((message) => (
                    <div key={message.id}>
                        {/* Hide text message when showing booking card (card shows the same info) */}
                        {!(message.action && message.action.type === 'booking_confirmation') && (
                            <MessageBubble
                                role={message.role}
                                content={message.content}
                            />
                        )}
                        {message.action && message.action.type === 'booking_confirmation' && (
                            <BookingCard
                                service={message.action.data.service}
                                date={message.action.data.date}
                                time={message.action.data.time}
                                seats={message.action.data.seats}
                                name={message.action.data.name}
                                email={message.action.data.email}
                                status={message.actionStatus}
                                onConfirm={() => handleConfirmBooking(message.id, message.action!.data)}
                                onCancel={() => handleCancelBooking(message.id)}
                            />
                        )}
                    </div>
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
                        ref={inputRef}
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
