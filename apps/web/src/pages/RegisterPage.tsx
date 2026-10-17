import { Alert, Anchor, Stack, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError, type RegisterInput } from "../api/client";
import { tooManyAttemptsMessage } from "../api/messages";
import { displayNameError } from "../auth/displayName";
import { AuthLayout, AuthPasswordInput, AuthSubmit, AuthTextInput } from "../auth/AuthLayout";
import { ProviderButtons } from "../auth/ProviderButtons";
import { safeReturnPath } from "../auth/returnPath";
import { useSession } from "../auth/useSession";

export default function RegisterPage() {
  const { register } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  // Mirrors the server's rules so most mistakes show before submitting; the server stays the authority.
  const form = useForm<RegisterInput>({
    initialValues: { displayName: "", email: "", password: "" },
    validate: {
      displayName: displayNameError,
      email: (value) =>
        /^\S+@\S+\.\S+$/.test(value.trim()) ? null : "Enter a valid email address",
      password: (value) =>
        value.length < 8 || value.length > 128 ? "Use between 8 and 128 characters" : null,
    },
  });

  async function submit(values: RegisterInput) {
    setFormError(null);
    try {
      await register({
        ...values,
        displayName: values.displayName.trim(),
        email: values.email.trim(),
      });
      navigate(safeReturnPath(searchParams.get("returnTo")), { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        form.setFieldError("email", error.message);
      } else if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        form.setErrors(error.fieldErrors);
      } else if (error instanceof ApiError && error.status === 429) {
        setFormError(tooManyAttemptsMessage(error.retryAfterSeconds));
      } else if (error instanceof ApiError && error.status === 400) {
        setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start moving work from backlog to done."
      gap={18}
    >
      {formError && <Alert color="red">{formError}</Alert>}
      <ProviderButtons />
      <form onSubmit={form.onSubmit(submit)}>
        <Stack gap={18}>
          <AuthTextInput label="Name" autoComplete="name" {...form.getInputProps("displayName")} />
          <AuthTextInput
            label="Email"
            type="email"
            autoComplete="email"
            {...form.getInputProps("email")}
          />
          <AuthPasswordInput
            label="Password"
            description="8 to 128 characters"
            autoComplete="new-password"
            {...form.getInputProps("password")}
          />
          <AuthSubmit loading={form.submitting}>Create account</AuthSubmit>
        </Stack>
      </form>
      <Text size="sm">
        Already have an account?{" "}
        <Anchor component={Link} to={{ pathname: "/login", search: searchParams.toString() }}>
          Sign in
        </Anchor>
      </Text>
    </AuthLayout>
  );
}
