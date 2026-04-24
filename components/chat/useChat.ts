'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookingData, Message } from './chat-types';

export function useChat() {
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

    useEffect(() => {
        if (!isLoading) {
            inputRef.current?.focus();
        }
    }, [isLoading]);

    const handleConfirmBooking = useCallback(async (messageId: string, data: BookingData) => {
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
    }, []);

    const handleCancelBooking = useCallback((messageId: string) => {
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
    }, []);

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

    return {
        messages,
        inputValue,
        setInputValue,
        isLoading,
        messagesEndRef,
        inputRef,
        handleConfirmBooking,
        handleCancelBooking,
        onSubmit,
    };
}
