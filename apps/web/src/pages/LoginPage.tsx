import { Alert, Anchor, Group, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { ApiError, type LoginInput } from "../api/client";
import { providerSignInErrorMessage, tooManyAttemptsMessage } from "../api/messages";
import {
  AuthForm,
  AuthLayout,
  AuthPasswordInput,
  AuthSubmit,
  AuthTextInput,
} from "../auth/AuthLayout";
import { ProviderButtons } from "../auth/ProviderButtons";
import { safeReturnPath } from "../auth/returnPath";
import { useSession } from "../auth/useSession";

export default function LoginPage() {
  const { login } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // After a password reset the User arrives with their email kept, so only the new password is left to type.
  const location = useLocation();
  const keptEmail = (location.state as { email?: unknown } | null)?.email;
  const resetEmail = typeof keptEmail === "string" ? keptEmail : "";
  const [formError, setFormError] = useState<string | null>(null);
  // Set by the server when a provider sign-in ended back here with a reason. It describes the last provider
  // attempt only, so it goes away once the User tries the form instead.
  const [providerErrorShown, setProviderErrorShown] = useState(true);
  const providerError = providerErrorShown
    ? providerSignInErrorMessage(searchParams.get("error"), searchParams.get("provider"))
    : null;

  const form = useForm<LoginInput>({
    initialValues: { email: resetEmail, password: "" },
    // Same limits as the server, so oversized input is caught before submitting.
    validate: {
      email: (value) => {
        if (!value.trim()) return "Enter your email";
        return value.trim().length > 254 ? "Email must be at most 254 characters" : null;
      },
      password: (value) => {
        if (!value) return "Enter your password";
        return value.length > 128 ? "Passwords are at most 128 characters" : null;
      },
    },
  });

  async function submit(values: LoginInput) {
    setFormError(null);
    setProviderErrorShown(false);
    try {
      await login({ ...values, email: values.email.trim() });
      navigate(safeReturnPath(searchParams.get("returnTo")), { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setFormError("Invalid email or password.");
      } else if (error instanceof ApiError && error.status === 429) {
        setFormError(tooManyAttemptsMessage(error.retryAfterSeconds));
      } else if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        form.setErrors(error.fieldErrors);
      } else if (error instanceof ApiError && error.status === 400) {
        setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to Nimbus" gap={22}>
      {providerError && <Alert color="red">{providerError}</Alert>}
      {formError && <Alert color="red">{formError}</Alert>}
      <ProviderButtons />
      <AuthForm onSubmit={form.onSubmit(submit)}>
        <AuthTextInput
          label="Email"
          type="email"
          autoComplete="email"
          {...form.getInputProps("email")}
        />
        <AuthPasswordInput
          label={
            <Group justify="space-between" component="span" wrap="nowrap">
              <span>Password</span>
              <Anchor component={Link} to="/forgot-password" size="sm" fw={500}>
                Forgot password?
              </Anchor>
            </Group>
          }
          autoComplete="current-password"
          autoFocus={resetEmail !== ""}
          {...form.getInputProps("password")}
        />
        <AuthSubmit loading={form.submitting}>Sign in</AuthSubmit>
      </AuthForm>
      <Text size="sm">
        New to Nimbus?{" "}
        <Anchor component={Link} to={{ pathname: "/register", search: searchParams.toString() }}>
          Create an account
        </Anchor>
      </Text>
    </AuthLayout>
  );
}
