import { Container, Text, Title } from "@mantine/core";
import { useSession } from "../auth/useSession";

// Placeholder signed-in home page; replaced once projects exist.
export default function HomePage() {
  const { user } = useSession();

  return (
    <Container size="sm" px={0} py="xl">
      <Title order={1}>Welcome, {user?.displayName}</Title>
      <Text c="dimmed" mt="xs">
        You're signed in as {user?.email}.
      </Text>
    </Container>
  );
}
