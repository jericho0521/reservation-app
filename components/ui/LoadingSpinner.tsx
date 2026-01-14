export default function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
    const sizeClasses = {
        sm: 'w-4 h-4 border-2',
        md: 'w-8 h-8 border-3',
        lg: 'w-12 h-12 border-4',
    };

    return (
        <div
            className={`${sizeClasses[size]} border-neon/30 border-t-neon rounded-full animate-spin`}
            role="status"
            aria-label="Loading"
        />
    );
}
