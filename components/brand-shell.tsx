import Link from "next/link";
import { Sparkles } from "lucide-react";
import styles from "./brand-shell.module.css";

export function BrandShell({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.headerContainer}>
          <Link href="/" className={styles.logoLink}>
            <span className={styles.logoIconWrapper}>
              <Sparkles size={16} />
            </span>
            Darul Aman Mentimeter
          </Link>
          <Link href="/join" className={styles.joinLink}>
            Join quiz
          </Link>
        </div>
      </header>
      {children}
    </main>
  );
}
