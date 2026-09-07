import Link from "next/link";
import { ArrowRight, BarChart3, RadioTower, Users } from "lucide-react";
import { BrandShell } from "@/components/brand-shell";
import { Button } from "@/components/ui/button";
import styles from "./page.module.css";

export default function Home() {
  return (
    <BrandShell>
      <section className={styles.container}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <RadioTower size={16} />
            Realtime powered by Supabase
          </div>
          
          <h1 className={styles.title}>
            Darul Aman <span className="text-gradient-accent">Mentimeter</span>
          </h1>
          
          <p className={styles.description}>
            Create live quiz presentations, invite participants with a 6-digit code, and sync every screen instantly with our premium zero-latency engine.
          </p>
          
          <div className={styles.actions}>
            <Button asChild size="lg">
              <Link href="/dashboard">
                Open dashboard <ArrowRight size={16} />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/join">Join a room</Link>
            </Button>
          </div>
        </div>

        <div className={styles.features}>
          {([
            ["Live answers", "Realtime vote charts update as responses are inserted.", BarChart3],
            ["Presence count", "Participants appear and disappear through room presence.", Users],
            ["Presenter control", "Slide index updates and broadcast events move everyone together.", RadioTower]
          ] as const).map(([title, copy, Icon]) => (
            <div key={String(title)} className={styles.featureCard}>
              <Icon className={styles.featureIcon} size={28} />
              <h2 className={styles.featureTitle}>{title as string}</h2>
              <p className={styles.featureCopy}>{copy as string}</p>
            </div>
          ))}
        </div>
      </section>
    </BrandShell>
  );
}
