import { Link } from 'react-router-dom'
import { Container, PageHeader } from '../components/ui'

export default function NotFound() {
  return (
    <>
      <PageHeader title="This page isn't on the map">The link may be old or mistyped.</PageHeader>
      <Container><Link to="/" className="btn btn-primary">Back to home</Link></Container>
    </>
  )
}
