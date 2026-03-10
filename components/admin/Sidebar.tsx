'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
    LayoutDashboard,
    Calendar,
    BarChart3,
    Users,
    Settings,
    HelpCircle,
    ChevronDown,
    Plus,
    type LucideIcon
} from 'lucide-react';
import './Sidebar.css';

interface NavItem {
    icon: LucideIcon;
    label: string;
    path?: string;
    actionIcon?: LucideIcon;
    submenu?: SubmenuItem[];
}

interface SubmenuItem {
    label: string;
    count?: number;
    path?: string;
}

const leftTopItems: { icon: LucideIcon; label: string }[] = [
    { icon: LayoutDashboard, label: 'Dashboard' },
    { icon: Calendar, label: 'Calendar' },
    { icon: BarChart3, label: 'Analytics' },
    { icon: Users, label: 'Users' },
];

const leftBottomItems: { icon: LucideIcon; label: string }[] = [
    { icon: Settings, label: 'Settings' },
    { icon: HelpCircle, label: 'Help' },
];

const navItems: NavItem[] = [
    {
        icon: LayoutDashboard,
        label: 'Dashboard',
        path: '/admin',
    },
    {
        icon: Calendar,
        label: 'Bookings',
        actionIcon: Plus,
        submenu: [
            { label: 'All Bookings', count: 50, path: '/admin' },
            { label: 'Today', count: 10, path: '/admin' },
            { label: 'Upcoming', count: 25, path: '/admin' },
            { label: 'Completed', count: 15, path: '/admin' },
        ],
    },
    {
        icon: BarChart3,
        label: 'Analytics',
        path: '/admin/analytics',
        submenu: [
            { label: 'Revenue', path: '/admin/analytics' },
            { label: 'Trends', path: '/admin/analytics' },
            { label: 'Reports', path: '/admin/analytics' },
        ],
    },
    {
        icon: Users,
        label: 'Customers',
        path: '#',
    },
    {
        icon: Settings,
        label: 'Settings',
        path: '#',
    },
];

interface IconButtonProps {
    Icon: LucideIcon;
    onClick?: () => void;
    active?: boolean;
}

const IconButton = ({ Icon, onClick, active }: IconButtonProps) => (
    <button
        className={`sidebar-icon-btn ${active ? 'active' : ''}`}
        onClick={onClick}
    >
        <Icon className="w-5 h-5" />
    </button>
);

interface SidebarHeaderProps {
    title: string;
    subtitle: string;
}

const SidebarHeader = ({ title, subtitle }: SidebarHeaderProps) => (
    <div className="sidebar-header">
        <div className="sidebar-header-content">
            <h2>{title}</h2>
            <h3>{subtitle}</h3>
        </div>
        <ChevronDown className="w-4 h-4 sidebar-chevron" />
    </div>
);

interface SubmenuProps {
    items: SubmenuItem[];
    onNavigate: (path: string) => void;
}

const Submenu = ({ items, onNavigate }: SubmenuProps) => (
    <ul className="sidebar-submenu">
        {items.map((item) => (
            <li key={item.label} onClick={() => item.path && onNavigate(item.path)}>
                {item.label}
                {item.count !== undefined && (
                    <span className="sidebar-badge">{item.count}</span>
                )}
            </li>
        ))}
    </ul>
);

interface NavItemProps {
    item: NavItem;
    expanded: boolean;
    onToggle: () => void;
    onNavigate: (path: string) => void;
}

const NavItemComponent = ({ item, expanded, onToggle, onNavigate }: NavItemProps) => {
    const Icon = item.icon;
    const ActionIcon = item.actionIcon;

    return (
        <div className="sidebar-nav-item">
            <button
                className="sidebar-nav-btn"
                onClick={() => {
                    if (item.submenu) {
                        onToggle();
                    } else if (item.path) {
                        onNavigate(item.path);
                    }
                }}
            >
                <Icon className="w-[18px] h-[18px]" />
                <span>{item.label}</span>
                {item.submenu && (
                    <ChevronDown className={`w-3 h-3 sidebar-nav-chevron ${expanded ? 'expanded' : ''}`} />
                )}
                {ActionIcon && !item.submenu && <ActionIcon className="w-4 h-4" />}
            </button>

            {item.submenu && expanded && (
                <Submenu items={item.submenu} onNavigate={onNavigate} />
            )}
        </div>
    );
};

interface NavigationProps {
    onNavigate: (path: string) => void;
}

const Navigation = ({ onNavigate }: NavigationProps) => {
    const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
        'Bookings': true,
    });

    const toggleItem = (label: string) => {
        setExpandedItems(prev => ({
            ...prev,
            [label]: !prev[label],
        }));
    };

    return (
        <nav className="sidebar-nav">
            {navItems.map((item) => (
                <NavItemComponent
                    key={item.label}
                    item={item}
                    expanded={!!expandedItems[item.label]}
                    onToggle={() => toggleItem(item.label)}
                    onNavigate={onNavigate}
                />
            ))}
        </nav>
    );
};

interface LeftSidebarProps {
    logoSrc?: string;
}

const LeftSidebar = ({ logoSrc }: LeftSidebarProps) => (
    <div className="sidebar-left">
        <div className="sidebar-logo">
            {logoSrc ? (
                <img src={logoSrc} alt="Logo" />
            ) : (
                <div className="sidebar-logo-placeholder">R</div>
            )}
        </div>
        <div className="sidebar-left-top">
            {leftTopItems.map((item) => (
                <IconButton key={item.label} Icon={item.icon} />
            ))}
        </div>
        <div className="sidebar-left-bottom">
            {leftBottomItems.map((item) => (
                <IconButton key={item.label} Icon={item.icon} />
            ))}
        </div>
    </div>
);

interface RightSidebarProps {
    title: string;
    subtitle: string;
    onNavigate: (path: string) => void;
}

const RightSidebar = ({ title, subtitle, onNavigate }: RightSidebarProps) => (
    <div className="sidebar-right">
        <div className="sidebar-right-inner">
            <SidebarHeader title={title} subtitle={subtitle} />
            <Navigation onNavigate={onNavigate} />
        </div>
    </div>
);

interface SidebarProps {
    title?: string;
    subtitle?: string;
    logoSrc?: string;
}

export const Sidebar = ({
    title = 'Admin Panel',
    subtitle = 'Reservation System',
    logoSrc,
}: SidebarProps) => {
    const router = useRouter();

    const handleNavigate = (path: string) => {
        if (path !== '#') {
            router.push(path);
        }
    };

    return (
        <aside className="admin-sidebar">
            <LeftSidebar logoSrc={logoSrc} />
            <RightSidebar
                title={title}
                subtitle={subtitle}
                onNavigate={handleNavigate}
            />
        </aside>
    );
};

export default Sidebar;
