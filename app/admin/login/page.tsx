'use client';

import { useRef, useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import './login.css';

export default function AdminLoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

    const getSupabase = () => {
        supabaseRef.current ??= createClient();
        return supabaseRef.current;
    };

    const handleLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const { error: signInError } = await getSupabase().auth.signInWithPassword({ email, password });

            if (signInError) {
                setError(signInError.message);
                return;
            }

            router.push('/admin');
            router.refresh();
        } catch {
            setError('An unexpected error occurred. Try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="admin-login-page">
            <section className="admin-login-intro" aria-labelledby="admin-login-title">
                <div className="admin-login-brand">
                    <Image
                        src="/images/brand/project-play-logo.png"
                        alt="Project Play By CW"
                        width={169}
                        height={50}
                        priority
                    />
                    <small>Operations</small>
                </div>

                <div className="admin-login-copy">
                    <span className="admin-login-kicker">Reservation control</span>
                    <h1 id="admin-login-title">Keep every session moving.</h1>
                    <p>A focused workspace for bookings, customer arrivals, and seat availability.</p>
                </div>

                <p className="admin-login-footnote">Authorized team access only</p>
            </section>

            <section className="admin-login-form-panel" aria-label="Admin sign in">
                <form onSubmit={handleLogin} className="admin-login-form">
                    <div className="admin-login-form-heading">
                        <LockKeyhole aria-hidden="true" />
                        <span className="admin-login-kicker">Secure workspace</span>
                        <h2>Sign in</h2>
                        <p>Use your administrator account to continue.</p>
                    </div>

                    {error && <div className="admin-login-error" role="alert">{error}</div>}

                    <label>
                        <span>Email address</span>
                        <input
                            type="email"
                            value={email}
                            onChange={event => setEmail(event.target.value)}
                            autoComplete="email"
                            placeholder="admin@example.com"
                            required
                        />
                    </label>

                    <label>
                        <span>Password</span>
                        <input
                            type="password"
                            value={password}
                            onChange={event => setPassword(event.target.value)}
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            required
                        />
                    </label>

                    <button type="submit" disabled={isLoading}>
                        <span>{isLoading ? 'Signing in' : 'Continue'}</span>
                        <ArrowRight aria-hidden="true" />
                    </button>
                </form>
            </section>
        </main>
    );
}
