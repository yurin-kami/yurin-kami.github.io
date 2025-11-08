import './globals.css';
import LayoutClient from './layoutClient';

export const metadata = {
  title: 'KAMISHOW!!!!!',
  description: '欢迎来到KAMISHOW!!!!!',
  icons: {
    icon: '/images/fav.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body>
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}