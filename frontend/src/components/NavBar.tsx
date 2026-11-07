import { NavLink } from "react-router";

export default function NavBar() {
  return (
    <header className="navbar">
      <span className="brand">Glorp's Magic Spaceship</span>
      <nav>
        <NavLink to="/" end>
          Map
        </NavLink>
        <NavLink to="/sanctuary">Sanctuary</NavLink>
      </nav>
    </header>
  );
}
