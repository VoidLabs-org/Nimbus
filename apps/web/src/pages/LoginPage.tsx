import { Alert, Anchor, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { ApiError, type LoginInput } from "../api/client";
import { GENERIC_ERROR, providerSignInErrorMessage, tooManyAttemptsMessage } from "../api/messages";
import {
  AuthForm,
  AuthLayout,
  AuthPasswordInput,
  AuthSubmit,
  AuthTextInput,
} from "../auth/AuthLayout";
import classes from "../auth/AuthLayout.module.css";
import { ProviderButtons } from "../auth/ProviderButtons";
import { returnToSearch, safeReturnPath } from "../auth/returnPath";
import { useSession } from "../auth/useSession";

export default function LoginPage() {
  const { login } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // After a password reset the User arrives with their email kept, so only the new password is left to type. From
  // a Two-step verification sign-in that timed out they arrive with a notice saying so.
  const location = useLocation();
  const state = location.state as { email?: unknown; notice?: unknown } | null;
  const resetEmail = typeof state?.email === "string" ? state.email : "";
  const notice = typeof state?.notice === "string" ? state.notice : null;
  const [formError, setFormError] = useState<string | null>(notice);
  // Shown once: the notice leaves the history entry, so a reload or coming back here doesn't repeat it.
  useEffect(() => {
    if (notice === null) return;
    // Once replaced, there is no notice left, so this runs once.
    void navigate(location, { replace: true, state: { ...state, notice: undefined } });
  }, [notice, location, navigate, state]);
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
      const outcome = await login({ ...values, email: values.email.trim() });
      if (outcome === "two-step") {
        // The code page keeps returnTo, and goes back here with it; a provider's error stays behind.
        navigate({
          pathname: "/login/two-step",
          search: returnToSearch(searchParams.get("returnTo")),
        });
        return;
      }
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
        setFormError(GENERIC_ERROR);
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
        {/* The link sits on the label's row but outside the label, so the field's name stays "Password". */}
        <div className={classes.passwordField}>
          <AuthPasswordInput
            label="Password"
            autoComplete="current-password"
            autoFocus={resetEmail !== ""}
            {...form.getInputProps("password")}
          />
          <Anchor component={Link} to="/forgot-password" size="sm" className={classes.forgotLink}>
            Forgot password?
          </Anchor>
        </div>
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
