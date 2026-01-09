export default function Footer() {
    return (
        <footer className="bg-racing-dark border-t border-white/10 py-12">
            <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="text-sm text-gray-400">
                    © {new Date().getFullYear()} ApexSim Racing. All rights reserved.
                </div>
                <div className="flex gap-6">
                    <a href="#" className="text-gray-400 hover:text-neon transition-colors">Twitter</a>
                    <a href="#" className="text-gray-400 hover:text-neon transition-colors">Instagram</a>
                    <a href="#" className="text-gray-400 hover:text-neon transition-colors">Discord</a>
                </div>
            </div>
        </footer>
    );
}
