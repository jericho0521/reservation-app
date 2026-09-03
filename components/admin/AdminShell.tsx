import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import '@/app/admin/AdminDashboard.css';

interface AdminShellProps {
    children: ReactNode;
    userEmail: string;
}

export function AdminShell({ children, userEmail }: AdminShellProps) {
    return (
        <div className="admin-shell">
            <Sidebar subtitle={userEmail} />
            <div className="admin-main">{children}</div>
        </div>
    );
}
