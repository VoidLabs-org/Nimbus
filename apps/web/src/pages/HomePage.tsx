import { Container, Group, Text, Title } from "@mantine/core";
import { UserMenu } from "../auth/UserMenu";
import { useSession } from "../auth/useSession";

// Placeholder signed-in home page; replaced once projects exist.
export default function HomePage() {
  const { user } = useSession();

  return (
    <Container size="sm" py="xl">
      <Group justify="flex-end" mb="md">
        <UserMenu />
      </Group>
      <Title order={1}>Welcome, {user?.displayName}</Title>
      <Text c="dimmed" mt="xs">
        You're signed in as {user?.email}.
      </Text>
    </Container>
  );
}
