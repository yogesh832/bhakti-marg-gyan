import Navbar from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { BookOpen, Heart, Users, Sparkles } from "lucide-react";

const Teachings = () => {
  const teachings = [
    {
      icon: Heart,
      title: "Love and Devotion",
      description: "The essence of Bhakti is pure, unconditional love for the Divine. Through devotion, we transcend our ego and merge with the Supreme.",
    },
    {
      icon: BookOpen,
      title: "Scriptures and Wisdom",
      description: "Study the sacred texts with an open heart. The Bhagavad Gita, Bhagavatam, and other scriptures guide us on our spiritual journey.",
    },
    {
      icon: Users,
      title: "Satsang and Community",
      description: "Gather with fellow devotees in Satsang. The company of saints and spiritual seekers accelerates our progress on the path.",
    },
    {
      icon: Sparkles,
      title: "Meditation and Practice",
      description: "Regular spiritual practice purifies the mind and heart. Chanting, meditation, and seva lead us closer to divine realization.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-32 pb-16">
        <div className="text-center mb-12 animate-in fade-in slide-in-from-top duration-700">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            Core Teachings
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Fundamental principles of Bhakti Marg as taught by Premaanand Maharaj Ji
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {teachings.map((teaching, index) => (
            <Card
              key={index}
              className="p-6 hover:shadow-lg transition-shadow duration-300 border-border bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-bottom duration-700"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10">
                  <teaching.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2">{teaching.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {teaching.description}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-16 max-w-3xl mx-auto">
          <Card className="p-8 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
            <blockquote className="text-center">
              <p className="text-lg italic text-foreground/90 mb-4">
                "The path of devotion is not about renouncing the world, but about seeing the Divine in all of creation. 
                When we love God, we naturally love all beings."
              </p>
              <footer className="text-sm text-muted-foreground">
                — Premaanand Maharaj Ji
              </footer>
            </blockquote>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Teachings;
