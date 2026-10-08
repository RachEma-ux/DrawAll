import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Connexion (lot 8.3) : le serveur choisit un `state` aléatoire, le garde dans un cookie court et
 * redirige vers l'autorisation ; il le vérifie au retour.
 */
const LOGIN_PATH = "/api/oauth/login";

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              window.location.href = LOGIN_PATH;
            }}
          >
            Sign in with Kimi
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
