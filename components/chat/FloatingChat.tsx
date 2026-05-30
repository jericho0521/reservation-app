'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useChat } from './useChat';
import MessageBubble from './MessageBubble';
import BookingCard from './BookingCard';
import LocationDirectionsCard from './LocationDirectionsCard';
import type { BookingData, Message } from './chat-types';

const FloatingChatMessageItem = memo(function FloatingChatMessageItem({
    message,
    onConfirm,
    onCancel,
}: {
    message: Message;
    onConfirm: (messageId: string, data: BookingData) => void;
    onCancel: (messageId: string) => void;
}) {
    if (message.action?.type === 'booking_confirmation') {
        const action = message.action;

        return (
            <BookingCard
                service={action.data.service}
                date={action.data.date}
                time={action.data.time}
                seats={action.data.seats}
                name={action.data.name}
                email={action.data.email}
                phone={action.data.phone}
                status={message.actionStatus}
                onConfirm={() => onConfirm(message.id, action.data)}
                onCancel={() => onCancel(message.id)}
            />
        );
    }

    if (message.action?.type === 'location_directions') {
        return <LocationDirectionsCard data={message.action.data} />;
    }

    return (
        <MessageBubble
            role={message.role}
            content={message.content}
        />
    );
});

export default function FloatingChat() {
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    const {
        messages,
        inputValue,
        setInputValue,
        isLoading,
        messagesEndRef,
        inputRef,
        handleConfirmBooking,
        handleCancelBooking,
        onSubmit,
    } = useChat();

    const close = useCallback(() => {
        setIsOpen(false);
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                const target = e.target as HTMLElement;
                if (!target.closest('[data-floating-chat-toggle]')) {
                    close();
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, close]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    return (
        <>
            {isOpen && (
                <div className="fixed inset-0 bg-black/30 z-40 md:bg-transparent md:pointer-events-none" />
            )}

            <div
                ref={panelRef}
                className={`fixed bottom-24 right-6 z-50 w-[calc(100vw-2rem)] max-w-[400px] h-[560px] max-h-[calc(100vh-8rem)] bg-racing-dark/98 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl flex flex-col transition-all duration-200 origin-bottom-right ${
                    isOpen
                        ? 'opacity-100 scale-100 pointer-events-auto'
                        : 'opacity-0 scale-95 pointer-events-none'
                }`}
            >
                <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
                    <div>
                        <h3 className="font-bold font-heading text-white">AI Booking Assistant</h3>
                        <p className="text-xs text-gray-400">Ask about bookings or anything else!</p>
                    </div>
                    <button
                        onClick={close}
                        className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        aria-label="Close chat"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {messages.length === 0 && (
                        <div className="text-center text-gray-400 mt-6">
                            <div className="mb-3 flex justify-center">
                                <MessageCircle className="w-10 h-10 text-neon" />
                            </div>
                            <p className="text-base mb-1">Hi! I&apos;m your booking assistant.</p>
                            <p className="text-sm">Ask me about bookings, availability, or anything else!</p>
                        </div>
                    )}

                    {messages.map((message) => (
                        <FloatingChatMessageItem
                            key={message.id}
                            message={message}
                            onConfirm={handleConfirmBooking}
                            onCancel={handleCancelBooking}
                        />
                    ))}

                    {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                        <div className="flex justify-start">
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

                <form
                    onSubmit={onSubmit}
                    className="p-3 border-t border-white/10 shrink-0"
                >
                    <div className="flex gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            disabled={isLoading}
                            placeholder="Type your message..."
                            className="flex-1 px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-white text-sm placeholder-gray-500 focus:border-neon focus:outline-none focus:ring-1 focus:ring-neon transition-colors"
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !inputValue.trim()}
                            className="px-4 py-2.5 bg-neon text-racing-dark font-bold rounded-lg text-sm hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        >
                            {isLoading ? (
                                <span className="inline-block w-4 h-4 border-2 border-racing-dark/30 border-t-racing-dark rounded-full animate-spin" />
                            ) : (
                                'Send'
                            )}
                        </button>
                    </div>
                </form>
            </div>

            <button
                data-floating-chat-toggle
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-105 ${
                    isOpen
                        ? 'bg-white/10 border border-white/20 text-white'
                        : 'bg-neon text-racing-dark shadow-[0_0_20px_rgba(185,217,207,0.4)]'
                }`}
                aria-label={isOpen ? 'Close chat' : 'Open chat'}
            >
                {isOpen ? (
                    <X className="w-6 h-6" />
                ) : (
                    <MessageCircle className="w-6 h-6" />
                )}
            </button>
        </>
    );
}
