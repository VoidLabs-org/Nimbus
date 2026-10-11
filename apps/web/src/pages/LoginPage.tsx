import {
  Alert,
  Anchor,
  Button,
  Container,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError, type LoginInput } from "../api/client";
import { tooManyAttemptsMessage } from "../api/messages";
import { safeReturnPath } from "../auth/returnPath";
import { useSession } from "../auth/useSession";

export default function LoginPage() {
  const { login } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    initialValues: { email: "", password: "" },
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
    <Container size={420} py="xl">
      <Title order={2} ta="center">
        Sign in to Nimbus
      </Title>
      <Paper withBorder p="lg" mt="lg" radius="md">
        <form onSubmit={form.onSubmit(submit)}>
          <Stack>
            {formError && <Alert color="red">{formError}</Alert>}
            <TextInput
              label="Email"
              type="email"
              autoComplete="email"
              {...form.getInputProps("email")}
            />
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              {...form.getInputProps("password")}
            />
            <Button type="submit" loading={form.submitting}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
      <Text ta="center" mt="md" size="sm">
        New to Nimbus?{" "}
        <Anchor component={Link} to={{ pathname: "/register", search: searchParams.toString() }}>
          Create an account
        </Anchor>
      </Text>
    </Container>
  );
}
