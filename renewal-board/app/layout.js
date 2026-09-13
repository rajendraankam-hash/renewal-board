import "./globals.css";

export const metadata = {
  title: "Renewal & Lead Follow-Up Board",
  description:
    "One screen of every policy renewal, loan file and cold lead: due date, handler and amount at risk.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
