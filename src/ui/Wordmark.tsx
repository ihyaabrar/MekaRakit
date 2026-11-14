import Link from "next/link";
import ui from "./ui.module.css";

// Text wordmark is the logo until a real one is designed (owner's choice).
export default function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className={ui.wordmark}>
      Meka<span>Rakit</span>
    </Link>
  );
}
