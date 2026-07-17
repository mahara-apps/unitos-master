import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";

const emailSchema = z.string().trim().min(1, "Informe seu email").email("Email inválido").max(255);
const passwordSchema = z.string().min(8, "Mínimo de 8 caracteres").max(72, "Máximo de 72 caracteres");

const signInSchema = z.object({ email: emailSchema, password: passwordSchema });
const signUpSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(80),
  email: emailSchema,
  password: passwordSchema,
});

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

export function LoginForm() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();

  function resolveNext(): string {
    if (typeof window === "undefined") return "/dashboard";
    const raw = new URLSearchParams(window.location.search).get("next");
    if (!raw) return "/dashboard";
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
    } catch {}
    return "/dashboard";
  }

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });
  const signUpForm = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSignIn(values: SignInValues) {
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Não foi possível entrar", { description: error.message });
      return;
    }
    toast.success("Bem-vindo de volta");
    await router.invalidate();
    navigate({ to: resolveNext(), replace: true });
  }

  async function onSignUp(values: SignUpValues) {
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: values.name },
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error("Não foi possível cadastrar", { description: error.message });
      return;
    }
    toast.success("Conta criada", { description: "Você já pode acessar o painel." });
    await router.invalidate();
    navigate({ to: resolveNext(), replace: true });
  }

  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Unitos
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Entre ou crie sua conta para acessar o painel.
        </p>
      </div>

      <div
        className={cn(
          "rounded-xl border border-border bg-card p-6 sm:p-8",
          "shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-8px_rgba(16,24,40,0.08)]",
        )}
      >
        <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
          <TabsList variant="grid" className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar conta</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-6">
            <Form {...signInForm}>
              <form onSubmit={signInForm.handleSubmit(onSignIn)} className="space-y-5">
                <FormField
                  control={signInForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="voce@exemplo.com" autoComplete="email" className="h-11" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={signInForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Senha</FormLabel>
                        <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                          Esqueci minha senha
                        </Link>
                      </div>
                      <FormControl>
                        <PasswordInput field={field} show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={submitting} className="h-11 w-full">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
                </Button>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="signup" className="mt-6">
            <Form {...signUpForm}>
              <form onSubmit={signUpForm.handleSubmit(onSignUp)} className="space-y-5">
                <FormField
                  control={signUpForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input placeholder="Seu nome completo" autoComplete="name" className="h-11" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={signUpForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="voce@exemplo.com" autoComplete="email" className="h-11" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={signUpForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Senha</FormLabel>
                      <FormControl>
                        <PasswordInput field={field} show={showPassword} onToggle={() => setShowPassword((v) => !v)} autoComplete="new-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={submitting} className="h-11 w-full">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}
                </Button>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function PasswordInput({
  field,
  show,
  onToggle,
  autoComplete = "current-password",
}: {
  field: React.ComponentProps<typeof Input>;
  show: boolean;
  onToggle: () => void;
  autoComplete?: string;
}) {
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        placeholder="••••••••"
        autoComplete={autoComplete}
        className="h-11 pr-10"
        {...field}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}