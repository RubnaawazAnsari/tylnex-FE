import Image from "next/image";
import PhonePanel from "./components/PhonePanel";
import FaxApp from "./components/FaxPanel";

export default function Home() {
  return (
    <main className="min-h-screen grid place-items-center">
      {/* <PhonePanel /> */}
      <FaxApp />
    </main>
  );
}
