import { Link, useLocation } from "react-router-dom";
import { Flower2 } from "lucide-react";

const Navbar = () => {
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;
  
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <Flower2 className="w-7 h-7 text-primary transition-transform group-hover:rotate-12" />
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Bhakti Marg AI
            </span>
          </Link>
          
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className={`text-sm font-medium transition-colors hover:text-primary ${
                isActive("/") ? "text-primary" : "text-foreground/70"
              }`}
            >
              Home
            </Link>
            <Link
              to="/teachings"
              className={`text-sm font-medium transition-colors hover:text-primary ${
                isActive("/teachings") ? "text-primary" : "text-foreground/70"
              }`}
            >
              Teachings
            </Link>
            <Link
              to="/about"
              className={`text-sm font-medium transition-colors hover:text-primary ${
                isActive("/about") ? "text-primary" : "text-foreground/70"
              }`}
            >
              About Maharaj Ji
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
