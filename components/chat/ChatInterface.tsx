'use client';

import { memo } from 'react';
import { MessageCircle } from 'lucide-react';
import { useChat } from './useChat';
import MessageBubble from './MessageBubble';
import BookingCard from './BookingCard';
import LocationDirectionsCard from './LocationDirectionsCard';
import WhatsAppContactCard from './WhatsAppContactCard';
import type { BookingData, Message } from './chat-types';

const ChatMessageItem = memo(function ChatMessageItem({
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

    if (message.action?.type === 'whatsapp_contact') {
        return <WhatsAppContactCard data={message.action.data} />;
    }

    return (
        <MessageBubble
            role={message.role}
            content={message.content}
        />
    );
});

export default function ChatInterface() {
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

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)]">
            <div className="p-4 border-b border-white/10 bg-white/5">
                <h2 className="text-xl font-bold font-heading">AI Booking Assistant</h2>
                <p className="text-sm text-gray-400">I can help you book a session!</p>
            </div>

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
                    <ChatMessageItem
                        key={message.id}
                        message={message}
                        onConfirm={handleConfirmBooking}
                        onCancel={handleCancelBooking}
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
