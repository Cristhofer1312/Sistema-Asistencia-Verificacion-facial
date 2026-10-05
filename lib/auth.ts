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

        if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
          throw new Error("Cuenta bloqueada temporalmente por múltiples intentos fallidos.");
        }

        const ok = await bcrypt.compare(password, usuario.passwordHash);
        if (!ok) {
          const MAX_INTENTOS = 5;
          const nuevosIntentos = (usuario.intentosFallidos || 0) + 1;
          const bloqueadoHasta = nuevosIntentos >= MAX_INTENTOS ? new Date(Date.now() + 15 * 60 * 1000) : null;
          
          await prisma.usuario.update({
            where: { id: usuario.id },
            data: { intentosFallidos: nuevosIntentos, bloqueadoHasta }
          });
          
          if (bloqueadoHasta) {
             throw new Error("Demasiados intentos fallidos. Cuenta bloqueada por 15 minutos.");
          }
          return null; // Credenciales inválidas normales
        }

        if (usuario.intentosFallidos > 0 || usuario.bloqueadoHasta) {
          await prisma.usuario.update({
             where: { id: usuario.id },
             data: { intentosFallidos: 0, bloqueadoHasta: null }
          });
        }

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
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id           = (user as any).id;
        token.username     = (user as any).username;
        token.rol          = (user as any).rol;
        token.gerenciaId   = (user as any).gerenciaId;
        token.gerenciaNombre = (user as any).gerenciaNombre;
        token.claveInicial = (user as any).claveInicial;
      }
      
      // Re-validación o actualización de sesión
      if (trigger === "update" && session) {
        if (session.claveInicial !== undefined) {
          token.claveInicial = session.claveInicial;
        }
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
