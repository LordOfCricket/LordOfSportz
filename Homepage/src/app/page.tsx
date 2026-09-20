import Hero from "@/components/home/Hero";
import SportsUniverse from "@/components/home/SportsUniverse";
import Ecosystem from "@/components/home/Ecosystem";
import FutureSports from "@/components/home/FutureSports";
import MatchesPreview from "@/components/home/MatchesPreview";
import ShopPreview from "@/components/home/ShopPreview";

export default function Home() {
  return (
    <>
      <Hero />
      <SportsUniverse />
      <MatchesPreview />
      <ShopPreview />
      <FutureSports />
      <Ecosystem />
    </>
  );
}
