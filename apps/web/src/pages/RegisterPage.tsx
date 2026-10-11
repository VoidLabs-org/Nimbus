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
import { Link, useNavigate } from "react-router";
import { ApiError, type RegisterInput } from "../api/client";
import { tooManyAttemptsMessage } from "../api/messages";
import { useSession } from "../auth/useSession";

export default function RegisterPage() {
  const { register } = useSession();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  // Mirrors the server's rules so most mistakes show before submitting; the server stays the authority.
  const form = useForm<RegisterInput>({
    initialValues: { displayName: "", email: "", password: "" },
    validate: {
      displayName: (value) => (value.trim() ? null : "Enter your name"),
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
      navigate("/", { replace: true });
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
    <Container size={420} py="xl">
      <Title order={2} ta="center">
        Create your Nimbus account
      </Title>
      <Paper withBorder p="lg" mt="lg" radius="md">
        <form onSubmit={form.onSubmit(submit)}>
          <Stack>
            {formError && <Alert color="red">{formError}</Alert>}
            <TextInput label="Name" autoComplete="name" {...form.getInputProps("displayName")} />
            <TextInput
              label="Email"
              type="email"
              autoComplete="email"
              {...form.getInputProps("email")}
            />
            <PasswordInput
              label="Password"
              description="8 to 128 characters"
              autoComplete="new-password"
              {...form.getInputProps("password")}
            />
            <Button type="submit" loading={form.submitting}>
              Create account
            </Button>
          </Stack>
        </form>
      </Paper>
      <Text ta="center" mt="md" size="sm">
        Already have an account?{" "}
        <Anchor component={Link} to="/login">
          Sign in
        </Anchor>
      </Text>
    </Container>
  );
}
