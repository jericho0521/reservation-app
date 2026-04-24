import ChatInterface from '@/components/chat/ChatInterface';
import Header from '@/components/shared/Header';

export default function ChatBookingPage() {
    return (
        <>
            <Header />
            <main className="min-h-screen bg-racing-dark text-white pt-20">
                <ChatInterface />
            </main>
        </>
    );
}
