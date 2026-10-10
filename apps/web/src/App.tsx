import { Button, Container, Group, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'

// Placeholder home page; replace once routing and layout are in place.
export default function App() {
  return (
    <Container size="sm" py="xl">
      <Title order={1}>Nimbus</Title>
      <Text c="dimmed" mt="xs">
        Projects, issues, boards and sprints.
      </Text>
      <Group mt="lg">
        <Button
          onClick={() =>
            notifications.show({ title: 'Mantine is set up', message: 'Theme and notifications work.' })
          }
        >
          Test notification
        </Button>
      </Group>
    </Container>
  )
}
