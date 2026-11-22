import Navbar from "@/components/Navbar";
import { Card } from "@/components/ui/card";

const About = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-32 pb-16">
        <div className="text-center mb-12 animate-in fade-in slide-in-from-top duration-700">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            About Maharaj Ji
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Learn about the divine messenger of Bhakti Marg
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-8">
          <Card className="p-8 bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-bottom duration-700">
            <h2 className="text-2xl font-semibold mb-4 text-primary">The Spiritual Guide</h2>
            <div className="space-y-4 text-foreground/90 leading-relaxed">
              <p>
                Premaanand Maharaj Ji is a revered spiritual teacher who has dedicated his life to spreading 
                the message of divine love and devotion. Through his teachings, countless seekers have found 
                the path to spiritual awakening and self-realization.
              </p>
              <p>
                His approach to spirituality is rooted in the ancient tradition of Bhakti Yoga, emphasizing 
                the importance of pure devotion, selfless service, and unconditional love for the Divine.
              </p>
            </div>
          </Card>

          <Card className="p-8 bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-bottom duration-700 delay-100">
            <h2 className="text-2xl font-semibold mb-4 text-primary">Mission and Vision</h2>
            <div className="space-y-4 text-foreground/90 leading-relaxed">
              <p>
                Maharaj Ji's mission is to guide spiritual seekers on their journey toward God-realization. 
                He teaches that true happiness and fulfillment can only be found through developing a loving 
                relationship with the Divine.
              </p>
              <p>
                Through discourses, satsangs, and personal guidance, he helps devotees understand and practice 
                the principles of Bhakti Marg, making ancient wisdom accessible and relevant to modern life.
              </p>
            </div>
          </Card>

          <Card className="p-8 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20 animate-in fade-in slide-in-from-bottom duration-700 delay-200">
            <h2 className="text-2xl font-semibold mb-4 text-primary">Connect with the Teachings</h2>
            <p className="text-foreground/90 leading-relaxed mb-4">
              This AI-powered platform brings Maharaj Ji's wisdom to seekers worldwide. Ask your questions 
              and receive guidance inspired by his teachings, available anytime you need spiritual support.
            </p>
            <p className="text-sm text-muted-foreground italic">
              Note: This is an AI assistant trained on Maharaj Ji's teachings. For personal guidance, 
              please attend live satsangs and connect with the spiritual community.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default About;
