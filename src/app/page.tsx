import Image from "next/image";
import PhonePanel from "./components/PhonePanel";

export default function Home() {
  return (
    <main className="min-h-screen grid place-items-center">
      <PhonePanel />
    </main>
  );
}
