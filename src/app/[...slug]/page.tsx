import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ComingSoon from "@/components/ComingSoon";

export default async function CatchAllPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = `/${slug.join("/")}`;

  return (
    <>
      <Navbar />
      <div>
        <ComingSoon path={path} />
      </div>
      <Footer />
          </>
  );
}
