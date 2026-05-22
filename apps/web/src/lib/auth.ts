import type { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyUserCredentials } from '@stockflow/api';

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: { email: { label: 'Email', type: 'email' }, password: { label: 'Password', type: 'password' } },
      authorize: async (creds) => {
        if (!creds?.email || !creds.password) return null;
        const user = await verifyUserCredentials(creds.email, creds.password);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId, warehouseId: user.warehouseId };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.warehouseId = user.warehouseId;
      }
      return token;
    },
    session: ({ session, token }) => {
      session.user = {
        ...session.user,
        id: token.uid,
        role: token.role,
        tenantId: token.tenantId,
        warehouseId: token.warehouseId,
      };
      return session;
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
};
