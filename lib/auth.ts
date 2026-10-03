// lib/auth.ts
import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1).max(60),
  password: z.string().min(1).max(128),
});

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { username, password } = parsed.data;

        const usuario = await prisma.usuario.findUnique({
          where: { username },
          include: { gerencia: true },
        });

        if (!usuario || !usuario.activo) return null;

        const ok = await bcrypt.compare(password, usuario.passwordHash);
        if (!ok) return null;

        await prisma.logAuditoria.create({
          data: {
            accion: "LOGIN",
            usuarioId: usuario.id,
            detalle: `Login exitoso: ${username}`,
          },
        });

        return {
          id:           String(usuario.id),
          username:     usuario.username,
          rol:          usuario.rol,
          gerenciaId:   usuario.gerenciaId ?? undefined,
          gerenciaNombre: usuario.gerencia?.nombre ?? undefined,
          claveInicial: usuario.claveInicial,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id           = (user as any).id;
        token.username     = (user as any).username;
        token.rol          = (user as any).rol;
        token.gerenciaId   = (user as any).gerenciaId;
        token.gerenciaNombre = (user as any).gerenciaNombre;
        token.claveInicial = (user as any).claveInicial;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id:            token.id as string,
        username:      token.username as string,
        rol:           token.rol as string,
        gerenciaId:    token.gerenciaId as number | undefined,
        gerenciaNombre: token.gerenciaNombre as string | undefined,
        claveInicial:  token.claveInicial as boolean,
      } as any;
      return session;
    },
  },

  events: {
    async signOut({ token }) {
      if (token?.id) {
        await prisma.logAuditoria.create({
          data: {
            accion: "LOGOUT",
            usuarioId: Number(token.id),
            detalle: `Logout: ${token.username}`,
          },
        }).catch(() => {});
      }
    },
  },

  pages: {
    signIn:  "/",
    error:   "/",
  },

  session: {
    strategy: "jwt",
    maxAge:   8 * 60 * 60, // 8 horas
  },

  secret: process.env.NEXTAUTH_SECRET,
};
