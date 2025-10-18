import Navbar from "@/components/Navbar";
import ChatBox from "@/components/ChatBox";
import { Flower2 } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-32 pb-16">
        <div className="text-center mb-12 animate-in fade-in slide-in-from-top duration-700">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <Flower2 className="w-16 h-16 text-primary animate-pulse" />
              <div className="absolute inset-0 blur-xl bg-primary/20 animate-pulse" />
            </div>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            Ask Maharaj Ji 🙏
          </h1>
          
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Seek spiritual guidance through the divine teachings of Premanand Maharaj Ji.
            <br />
            Ask your questions and receive wisdom from the path of Bhakti.
          </p>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom duration-700 delay-200">
          <ChatBox />
        </div>
        
        <div className="mt-16 text-center text-sm text-muted-foreground">
          <p>🪔 All answers are inspired by the sacred teachings of Premanand Maharaj Ji 🪔</p>
        </div>
      </main>
    </div>
  );
};

export default Index;
