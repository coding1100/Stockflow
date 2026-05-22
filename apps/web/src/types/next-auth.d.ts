import type { Role } from '@stockflow/db';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: Role;
      tenantId: string;
      warehouseId: string;
    };
  }
  interface User {
    role: Role;
    tenantId: string;
    warehouseId: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid: string;
    role: Role;
    tenantId: string;
    warehouseId: string;
  }
}
