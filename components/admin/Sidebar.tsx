'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
    Armchair,
    CalendarDays,
    ExternalLink,
    KanbanSquare,
    LogOut,
    Menu,
    UserPlus,
    X,
    type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import './Sidebar.css';

interface AdminNavItem {
    icon: LucideIcon;
    label: string;
    description: string;
    path: string;
}

interface AdminNavGroup {
    label: string;
    items: AdminNavItem[];
}

/**
 * Navigation labels intentionally match each page's heading so the place a
 * user clicks and the place they land always share the same name.
 * Analytics and content pages stay reachable by URL but are deliberately
 * left out of the menu.
 */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
    {
        label: 'Operations',
        items: [
            { icon: KanbanSquare, label: 'Daily board', description: 'Move one day’s sessions through their workflow', path: '/admin' },
            { icon: UserPlus, label: 'Walk-in booking', description: 'Record a customer who arrived in person so their seats are blocked', path: '/admin/walk-in' },
            { icon: CalendarDays, label: 'All bookings', description: 'Search and update every booking, past and future', path: '/admin/bookings' },
            { icon: Armchair, label: 'Seat maintenance', description: 'Block seats that are under repair', path: '/admin/seat-maintenance' },
        ],
    },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap(group => group.items);

interface SidebarProps {
    subtitle?: string;
}

export function Sidebar({
    subtitle = 'Reservation admin',
}: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [signOutError, setSignOutError] = useState<string | null>(null);
    const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

    const isActive = (path: string) => (
        path === '/admin' ? pathname === '/admin' : pathname.startsWith(path)
    );

    const handleSignOut = async () => {
        setIsSigningOut(true);
        setSignOutError(null);
        try {
            supabaseRef.current ??= createClient();
            const { error } = await supabaseRef.current.auth.signOut();
            if (error) throw error;
            router.push('/admin/login');
            router.refresh();
        } catch {
            setSignOutError('Sign out failed. Your session is still active. Please try again.');
        } finally {
            setIsSigningOut(false);
        }
    };

    return (
        <>
            <button
                type="button"
                className="admin-mobile-menu"
                onClick={() => setMobileOpen(true)}
                aria-label="Open admin navigation"
                aria-expanded={mobileOpen}
            >
                <Menu aria-hidden="true" />
            </button>

            {mobileOpen && (
                <button
                    type="button"
                    className="admin-sidebar-scrim"
                    onClick={() => setMobileOpen(false)}
                    aria-label="Close admin navigation"
                />
            )}

            <aside className={`admin-sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="Admin navigation">
                <div className="admin-sidebar-brand">
                    <Link href="/admin" className="admin-sidebar-logo" aria-label="Admin home" title="Admin home">
                        <Image
                            src="/images/brand/project-play-logo.png"
                            alt="Project Play By CW"
                            width={169}
                            height={50}
                            priority
                        />
                    </Link>
                    <button
                        type="button"
                        className="admin-sidebar-close"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Close admin navigation"
                    >
                        <X aria-hidden="true" />
                    </button>
                </div>

                <nav className="admin-sidebar-nav">
                    {ADMIN_NAV_GROUPS.map(group => (
                        <div key={group.label} className="admin-sidebar-group">
                            <p className="admin-sidebar-kicker">{group.label}</p>
                            {group.items.map(item => {
                                const Icon = item.icon;
                                const active = isActive(item.path);

                                return (
                                    <Link
                                        key={item.path}
                                        href={item.path}
                                        className={`admin-sidebar-link ${active ? 'is-active' : ''}`}
                                        aria-current={active ? 'page' : undefined}
                                        onClick={() => setMobileOpen(false)}
                                        title={item.description}
                                    >
                                        <Icon aria-hidden="true" />
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                <div className="admin-sidebar-footer">
                    {signOutError && <p role="alert">{signOutError}</p>}
                    <a
                        href="/"
                        target="_blank"
                        rel="noreferrer"
                        className="admin-sidebar-link admin-sidebar-external"
                        title="Opens the customer-facing website in a new tab"
                    >
                        <ExternalLink aria-hidden="true" />
                        <span>View public site</span>
                    </a>

                    <div className="admin-sidebar-account">
                        <div className="admin-sidebar-account-copy">
                            <span>Signed in as</span>
                            <strong title={subtitle}>{subtitle}</strong>
                        </div>
                        <button
                            type="button"
                            className="admin-sidebar-signout"
                            onClick={handleSignOut}
                            disabled={isSigningOut}
                            title="Sign out"
                        >
                            <LogOut aria-hidden="true" />
                            <span>{isSigningOut ? 'Signing out' : 'Sign out'}</span>
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}

export default Sidebar;
