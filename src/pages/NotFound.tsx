import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { applySeo } from "@/lib/seo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    applySeo({
      title: "NZ Vehicle Finder - Page not found",
      description: "The requested NZ Vehicle Finder page could not be found.",
      canonical: `https://vehiclefinder.co.nz${location.pathname}`,
      noindex: true,
    });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">ERROR 404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          RETURN HOME
        </a>
      </div>
    </div>
  );
};

export default NotFound;
