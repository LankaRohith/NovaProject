export default function Home() {
    return (
      <>
        <section className="relative overflow-hidden">
          <div className="container py-20 md:py-28">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
              Timeless Craft. Modern Engineering.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">
              Nova brings precision and elegance to your everyday. Explore our crafted collection,
              engineered with uncompromising detail.
            </p>
            <div className="mt-8 flex gap-4">
              <a href="#collection" className="btn">Explore Collection</a>
              <a href="#story" className="btn">Our Story</a>
            </div>
          </div>
          {/* Hero image band */}
          <div className="h-64 md:h-96 w-full bg-black" />
        </section>
  
        <section id="collection" className="container py-16">
          <h2 className="text-2xl md:text-3xl font-semibold">Featured Collection</h2>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1,2,3].map(i => (
              <div key={i} className="border rounded overflow-hidden">
                <div className="aspect-[4/3] bg-gray-200" />
                <div className="p-4">
                  <h3 className="font-medium">Nova Model {i}</h3>
                  <p className="text-sm text-gray-600 mt-2">
                    Grade-5 titanium, sapphire crystal, automatic movement.
                  </p>
                  <button className="btn mt-4">View Details</button>
                </div>
              </div>
            ))}
          </div>
        </section>
  
        <section id="story" className="bg-black text-white">
          <div className="container py-16">
            <h2 className="text-2xl md:text-3xl font-semibold">The Nova Story</h2>
            <p className="mt-4 max-w-2xl text-gray-300">
              Inspired by precision timekeeping and contemporary design, Nova fuses traditional craft
              with cutting-edge materials to create icons built to last.
            </p>
          </div>
        </section>
  
        <footer className="border-t">
          <div className="container py-6 text-sm text-gray-600">© {new Date().getFullYear()} Nova.</div>
        </footer>
      </>
    );
  }
  