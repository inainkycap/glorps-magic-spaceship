import { Link } from "react-router";

export default function NotFound() {
  return (
    <section>
      <h1>Lost in space</h1>
      <p>
        <Link to="/">◀ Back to the map</Link>
      </p>
    </section>
  );
}
