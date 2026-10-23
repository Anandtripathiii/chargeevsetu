import { Link } from 'react-router-dom'
import { Container, PageHeader } from '../components/ui'

export default function NotFound() {
  return (
    <>
      <PageHeader title="Nothing lives at this address">The link may be old or mistyped.</PageHeader>
      <Container><Link to="/" className="btn btn-primary">Back to home</Link></Container>
    </>
  )
}
